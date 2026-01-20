import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PaymentVerify } from './pages/PaymentVerify';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: 'var(--space-4)'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        {children}
      </div>
    </div>
  );
}

function Home() {
  return (
    <Layout>
      <h1 style={{
        fontSize: '1.5rem',
        marginBottom: 'var(--space-2)',
        fontWeight: 600
      }}>
        Tanna
      </h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        System ready.
      </p>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/verify" element={
          <Layout>
            <PaymentVerify />
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
