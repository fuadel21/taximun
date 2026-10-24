import { LegalDocument, legalSections } from "./LegalShared";

export default function LegalTermsPage() {
  return <LegalDocument title="Términos y condiciones de uso" updated="Versión preliminar · octubre de 2026" sections={legalSections.terms} />;
}
