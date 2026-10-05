import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import RegisterProduct from "./pages/RegisterProduct";
import Register from "./pages/Register";
import ConnectWallet from "./pages/ConnectWallet";
import Authenticate from "./pages/Authenticate";
import Profile from "./pages/Profile";
import MyProducts from "./pages/MyProducts";
import ProductDetails from "./pages/ProductDetails";
import PublicPassport from "./pages/PublicPassport";
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/products" element={<MyProducts />} />
            <Route path="/products/:productId" element={<ProductDetails />} />
            <Route path="/passport/:publicId" element={<PublicPassport type="product" />} />
            <Route path="/warranty/:publicId" element={<PublicPassport type="warranty" />} />
            <Route path="/register-product" element={<RegisterProduct />} />
            <Route path="/authenticate" element={<Authenticate />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </AuthFlowProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}

export default App;
