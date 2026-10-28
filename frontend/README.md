# Tanna Frontend

Mobile-first React application for Tanna's buyer-facing product pages and vendor dashboard.

## Design Philosophy

- **Boring is trustworthy** — No flashy animations. Clear text, obvious CTAs, predictable layouts.
- **Mobile-first** — 90%+ of target users (Nigerian WhatsApp vendors and their buyers) browse on mobile.
- **Speed over polish** — Pages must load fast on poor networks. Every KB matters.

## Key Screens

### Public (No Auth Required)
| Screen | Purpose |
|---|---|
| **Product Page** | Buyer sees product details, price, and a single "Pay" button |
| **Payment Verification** | Post-payment confirmation with order ID and WhatsApp indicator |

### Vendor Dashboard (Authenticated)
| Screen | Purpose |
|---|---|
| **Dashboard** | Order overview — "What did I sell today?" |
| **Product List** | Manage products (create, edit, toggle active/inactive) |
| **Order Detail** | View order info, buyer details, payment status |
| **Settings** | Store configuration, WhatsApp number |
| **Create Store** | One-time store setup (name + slug) |

## Tech Stack

- **Framework**: [React](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (custom design system, no frameworks)
- **Routing**: React Router
- **Auth**: JWT tokens via AuthContext provider

## Getting Started

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` by default.

## Project Structure

```
src/
├── pages/
│   ├── auth/              # Login, Signup
│   ├── vendor/            # Dashboard, Products, Orders, Settings
│   └── public/            # Public product page
├── components/
│   ├── ProductForm.tsx    # Reusable product create/edit form
│   ├── ProtectedRoute.tsx # Auth route guard
│   └── public/            # Buyer-facing components
├── context/
│   └── AuthContext.tsx    # JWT auth state management
├── lib/
│   └── api.ts            # Axios API client (auto-attaches JWT)
├── types/                 # TypeScript type definitions
├── App.tsx               # Root component with routing
├── main.tsx              # Entry point
└── index.css             # Global styles
```
