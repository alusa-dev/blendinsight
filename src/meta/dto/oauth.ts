import { z } from "zod";

const idSchema = z.union([z.string(), z.number()]);

export const instagramOAuthTokenDto = z.object({
  access_token: z.string().min(1),
  user_id: idSchema.optional(),
  permissions: z.union([z.string(), z.array(z.string())]).optional(),
  expires_in: z.number().int().positive().optional(),
}).passthrough();

export const instagramOAuthTokenResponseDto = z.union([
  instagramOAuthTokenDto,
  z.object({ data: z.array(instagramOAuthTokenDto).min(1) }).passthrough()
    .transform((response) => response.data[0]),
]);

export const longLivedTokenDto = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
}).passthrough();

export const instagramProfileDto = z.object({
  user_id: idSchema.optional(),
  id: idSchema.optional(),
  username: z.string().min(1),
  account_type: z.string().optional(),
}).passthrough();

export const instagramProfileResponseDto = z.union([
  instagramProfileDto,
  z.object({ data: z.array(instagramProfileDto).min(1) }).passthrough()
    .transform((response) => response.data[0]),
]);

export const grantedPermissionsDto = z.object({
  data: z.array(z.object({
    permission: z.string(),
    status: z.string(),
  }).passthrough()),
}).passthrough();

export const facebookPagesDto = z.object({
  data: z.array(z.object({
    id: z.string(),
    name: z.string(),
    access_token: z.string().min(1).optional(),
    instagram_business_account: z.object({
      id: z.string(),
      username: z.string().optional(),
      account_type: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough()),
}).passthrough();
