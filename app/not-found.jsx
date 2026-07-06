import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty-state">
      <div className="empty-icon">🔍</div>
      <h3>Page Not Found</h3>
      <p>The page you are looking for does not exist.</p>
      <Link href="/" className="btn primary">Go Home</Link>
    </div>
  );
}
