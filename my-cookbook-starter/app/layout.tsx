
export const metadata = { title: 'Cookbook' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{background:'#f7f7fb', color:'#1f2333', margin:0, fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, Arial'}}>
        {children}
      </body>
    </html>
  );
}
