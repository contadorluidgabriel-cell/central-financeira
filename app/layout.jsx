import './globals.css';

export const metadata = {
  title: 'Central Financeira',
  description: 'Acompanhamento financeiro adaptável por cliente.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
