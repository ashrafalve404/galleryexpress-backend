import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitKycDto {
  @IsNotEmpty()
  @IsString()
  nidNumber: string;

  @IsNotEmpty()
  @IsString()
  nidFrontDocUrl: string;

  @IsNotEmpty()
  @IsString()
  nidBackDocUrl: string;

  @IsOptional()
  @IsString()
  nidDocUrl?: string;

  @IsNotEmpty()
  @IsString()
  counterName: string;

  @IsNotEmpty()
  @IsString()
  counterAddress: string;

  @IsOptional()
  @IsString()
  tradeLicenseNo?: string;
}
