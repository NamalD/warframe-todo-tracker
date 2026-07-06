import './../src/index.css';
import NavBar from './components/NavBar';

export const metadata = {
  title: 'Warframe Tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
