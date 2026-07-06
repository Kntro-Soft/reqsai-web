/**
 * Meeting languages offered for a discovery recording. Codes are BCP-47 tags accepted by the live STT
 * provider (Deepgram nova-2); labels are each language's own name (endonym) so no per-language i18n is
 * needed. The `multi` (real-time code-switching) option is intentionally omitted for now — it requires
 * the nova-3 model. Keep this list to codes the streaming model actually supports.
 * See https://developers.deepgram.com/docs/models-languages-overview.
 */
export interface DiscoveryLanguage {
  /** BCP-47 code sent to the backend / Deepgram. */
  readonly code: string;
  /** Endonym shown in the picker. */
  readonly label: string;
}

export const DISCOVERY_LANGUAGES: readonly DiscoveryLanguage[] = [
  { code: 'es', label: 'Español' },
  { code: 'es-419', label: 'Español (Latinoamérica)' },
  { code: 'en', label: 'English' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-NZ', label: 'English (New Zealand)' },
  { code: 'pt', label: 'Português' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'fr', label: 'Français' },
  { code: 'fr-CA', label: 'Français (Canada)' },
  { code: 'de', label: 'Deutsch' },
  { code: 'de-CH', label: 'Deutsch (Schweiz)' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'nl-BE', label: 'Vlaams' },
  { code: 'ca', label: 'Català' },
  { code: 'da', label: 'Dansk' },
  { code: 'sv', label: 'Svenska' },
  { code: 'no', label: 'Norsk' },
  { code: 'fi', label: 'Suomi' },
  { code: 'pl', label: 'Polski' },
  { code: 'cs', label: 'Čeština' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'hu', label: 'Magyar' },
  { code: 'ro', label: 'Română' },
  { code: 'bg', label: 'Български' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Bahasa Melayu' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'th', label: 'ไทย' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'zh-TW', label: '中文 (繁體)' },
  { code: 'zh-HK', label: '粵語' },
  { code: 'et', label: 'Eesti' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'lt', label: 'Lietuvių' },
];
