import { fail } from "@meditaur/domain";

export const AUTH_ERRORS = {
  emailRequired: "Enter your email address",
  passwordRequired: "Enter your password",
} as const;

export function requireEmail(value: string): string {
  const email = value.trim();
  if (!email) fail("auth.emailRequired", AUTH_ERRORS.emailRequired);
  return email;
}

export function requirePassword(value: string): string {
  if (!value) fail("auth.passwordRequired", AUTH_ERRORS.passwordRequired);
  return value;
}
