import Link from 'next/link';
import styles from './collections.module.css'; // Reusing layout styles

export default function NotFound() {
  return (
    <div className={styles.page} style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center',
      textAlign: 'center',
      padding: '0 20px',
      backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.8)), url("https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1600&q=80")',
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }}>
      <h1 style={{ fontSize: '120px', fontWeight: '900', color: 'var(--accent-color)', marginBottom: '20px' }}>404</h1>
      <h2 style={{ fontSize: '32px', color: 'var(--text-white)', marginBottom: '15px' }}>Lost in Space?</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '40px', maxWidth: '500px' }}>
        The page you are looking for seems to have vanished into the void. Let's get you back to the cinematic world.
      </p>
      <Link href="/" style={{
        padding: '15px 30px',
        border: '1px solid var(--accent-color)',
        borderRadius: '4px',
        color: 'var(--accent-color)',
        fontFamily: 'var(--font-mono)',
        fontSize: '14px',
        transition: 'var(--transition)'
      }} className="nav-link">
        Back to Safety
      </Link>
    </div>
  );
}
