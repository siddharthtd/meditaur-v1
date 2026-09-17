import { CATALOG_BACKUP_ERRORS } from "@meditaur/application";
import { AppError } from "@meditaur/domain";

export function errorCode(err: unknown): string | undefined {
  return err instanceof AppError ? err.code : undefined;
}

export function errorText(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function catalogRestoreError(err: unknown): string {
  if (err instanceof SyntaxError) return CATALOG_BACKUP_ERRORS.invalid;
  switch (errorCode(err)) {
    case "catalogBackup.invalid":
      return CATALOG_BACKUP_ERRORS.invalid;
    case "catalogBackup.version":
      return CATALOG_BACKUP_ERRORS.version;
    default:
      return errorText(err, "Could not restore catalog");
  }
}
