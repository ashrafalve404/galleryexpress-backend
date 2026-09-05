import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('SMS_API_KEY') || 'SoWjbF7rLC5Ec5upd5xu';
    this.senderId =
      this.configService.get<string>('SMS_SENDER_ID') || '8809617625732';
    this.apiUrl =
      this.configService.get<string>('SMS_API_URL') ||
      'http://bulksmsbd.net/api/smsapi';
  }

  formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('880')) {
      return cleaned;
    }
    if (cleaned.startsWith('0')) {
      return '88' + cleaned;
    }
    if (cleaned.length === 10 && cleaned.startsWith('1')) {
      return '880' + cleaned;
    }
    return cleaned;
  }

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const formattedPhone = this.formatPhoneNumber(phone);
    const message = `Your Ticket Dorkar OTP is ${otp}. Valid for 5 minutes.`;

    try {
      this.logger.log(`Sending OTP to ${formattedPhone} via BulkSMSBD...`);

      const payload = {
        api_key: this.apiKey,
        senderid: this.senderId,
        number: formattedPhone,
        message: message,
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resText = await response.text();
      this.logger.log(`BulkSMSBD Response for ${formattedPhone}: ${resText}`);
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to send SMS OTP to ${formattedPhone}: ${err?.message || err}`,
      );
      return false;
    }
  }
}
