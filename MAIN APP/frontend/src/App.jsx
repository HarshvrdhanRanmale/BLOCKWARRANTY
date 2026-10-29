import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing";
import RegisterProduct from "./pages/RegisterProduct";
import Register from "./pages/Register";
import ConnectWallet from "./pages/ConnectWallet";
import Authenticate from "./pages/Authenticate";
import Profile from "./pages/Profile";
import MyProducts from "./pages/MyProducts";
import ProductDetails from "./pages/ProductDetails";
import PublicPassport from "./pages/PublicPassport";
import TransferOwnership from "./pages/TransferOwnership";
import SupplierRegister from "./pages/supplier/SupplierRegister";
import SupplierDashboard from "./pages/supplier/SupplierDashboard";
import SupplierInventory from "./pages/supplier/SupplierInventory";
import SupplierInvoices from "./pages/supplier/SupplierInvoices";
import SupplierClaims from "./pages/supplier/SupplierClaims";
import { WalletProvider } from "./blockchain/WalletProvider";
import { AuthFlowProvider } from "./auth/AuthFlowProvider";

function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <AuthFlowProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<ConnectWallet />} />
            <Route path="/connect-wallet" element={<ConnectWallet />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<Navigate to="/products" replace />} />
            <Route path="/products" element={<MyProducts />} />
            <Route path="/products/:productId" element={<ProductDetails />} />
            <Route path="/transfer-ownership" element={<TransferOwnership />} />
            <Route path="/transfer-requests" element={<Navigate to="/transfer-ownership?tab=sent#requests" replace />} />
            <Route path="/passport/:publicId" element={<PublicPassport />} />
            <Route path="/register-product" element={<RegisterProduct />} />
            <Route path="/authenticate" element={<Authenticate />} />
            <Route path="/profile" element={<Profile />} />

            {/* Supplier Portal Routes */}
            <Route path="/supplier" element={<Navigate to="/supplier/dashboard" replace />} />
            <Route path="/supplier/register" element={<SupplierRegister />} />
            <Route path="/supplier/dashboard" element={<SupplierDashboard />} />
            <Route path="/supplier/inventory" element={<SupplierInventory />} />
            <Route path="/supplier/invoices" element={<SupplierInvoices />} />
            <Route path="/supplier/claims" element={<SupplierClaims />} />

            <Route path="*" element={<Landing />} />
          </Routes>
        </AuthFlowProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}

export default App;
