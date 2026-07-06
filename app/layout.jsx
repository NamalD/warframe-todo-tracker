import './../src/index.css';
import Link from 'next/link';

export const metadata = {
  title: 'Warframe Tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav">
          <div className="nav-inner">
            <strong className="brand">Warframe Tracker</strong>
            <div className="nav-links">
              <Link href="/">Home</Link>
              <Link href="/items">Items</Link>
              <Link href="/sources">Sources</Link>
              <Link href="/todos">Todos</Link>
              <Link href="/loadouts">Loadouts</Link>
              <Link href="/shopping-list">Shopping List</Link>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
