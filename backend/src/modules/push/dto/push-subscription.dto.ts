import { ArrayUnique, IsArray, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsOptional()
  expirationTime?: number | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class RemovePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}

export class UpdatePushPreferencesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  pushTypes: string[];
}
