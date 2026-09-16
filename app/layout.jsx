import './globals.css';
import OfxImportLauncher from '../components/OfxImportLauncher';
import OfxEntryPostingLauncher from '../components/OfxEntryPostingLauncher';

export const metadata = {
  title: 'Central Financeira',
  description: 'Acompanhamento financeiro adaptável por cliente.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}<OfxImportLauncher/><OfxEntryPostingLauncher/></body>
    </html>
  );
}
