import { LegalDocument, legalSections } from "./LegalShared";

export default function LegalPrivacyPage() {
  return <LegalDocument title="Política de privacidad" updated="Versión preliminar · octubre de 2026" sections={legalSections.privacy} />;
}
