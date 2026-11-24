/**
 * PII Data Masking & Input Sanitization Utilities
 * Cloned & adapted from CyberRig (Decree 13/2023/ND-CP compliance & AI prompt safety).
 */

export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const clean = phone.replace(/[\s.-]/g, '').trim();
  if (clean.length <= 4) return '****';
  if (clean.length <= 6) return `${clean.slice(0, 2)}**${clean.slice(-2)}`;
  return `${clean.slice(0, 3)}${'*'.repeat(Math.max(3, clean.length - 6))}${clean.slice(-3)}`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const clean = email.trim();
  const atIdx = clean.indexOf('@');
  if (atIdx <= 1) return '***@***';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(4, local.length - visible.length))}@${domain}`;
}

export function maskFullName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].length <= 2 ? '**' : `${parts[0][0]}***`;
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}***`;
  return `${parts[0]} *** ${parts[parts.length - 1]}`;
}

/**
 * Redacts phone numbers and emails embedded inside raw POS receipt strings before AI calls.
 */
export function maskRawPosPii(rawText: string): string {
  return rawText
    .replace(/\b(0|\+?84)[0-9\s.-]{8,12}\b/g, (m) => maskPhone(m))
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (m) => maskEmail(m));
}

export function sanitizeTextInput(value: unknown, maxLength = 2000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}
