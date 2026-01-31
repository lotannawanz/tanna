import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PaymentVerify } from './pages/PaymentVerify';
import { VendorLayout } from './pages/vendor/VendorLayout';
import { VendorDashboard } from './pages/vendor/VendorDashboard';
import { VendorOrderDetail } from './pages/vendor/VendorOrderDetail';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { CreateStorePage } from './pages/vendor/CreateStorePage';
import { PublicProductPage } from './pages/public/PublicProductPage';
import { ProductListPage } from './pages/vendor/ProductListPage';
import { ProductCreatePage } from './pages/vendor/ProductCreatePage';
import { ProductEditPage } from './pages/vendor/ProductEditPage';
import { VendorSettingsPage } from './pages/vendor/VendorSettingsPage';

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
      <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
        Payment clarity for WhatsApp vendors.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <a
          href="/signup"
          style={{
            display: 'block',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-black)',
            color: 'white',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500
          }}
        >
          Get Started
        </a>
        <a
          href="/login"
          style={{
            display: 'block',
            padding: 'var(--space-3)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            textDecoration: 'none',
            color: 'var(--text-primary)'
          }}
        >
          I already have an account
        </a>
      </div>
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/verify" element={
            <Layout>
              <PaymentVerify />
            </Layout>
          } />

          {/* Public Product Page (Epic 3) */}
          <Route path="/store/:storeSlug/product/:productSlug" element={<PublicProductPage />} />

          {/* Public Auth Routes */}
          <Route path="/login" element={<Layout><LoginPage /></Layout>} />
          <Route path="/signup" element={<Layout><SignupPage /></Layout>} />

          {/* Protected Vendor Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/create-store" element={<Layout><CreateStorePage /></Layout>} />

            <Route path="/vendor/:vendorId" element={<VendorLayout />}>
              <Route path="dashboard" element={<VendorDashboard />} />
              <Route path="orders/:orderId" element={<VendorOrderDetail />} />
              <Route path="products" element={<ProductListPage />} />
              <Route path="products/new" element={<ProductCreatePage />} />
              <Route path="products/:productId/edit" element={<ProductEditPage />} />
              <Route path="settings" element={<VendorSettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
