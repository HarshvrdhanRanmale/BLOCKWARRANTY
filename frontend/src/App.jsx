import { BrowserRouter, Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import MyProducts from "./pages/MyProducts";
import ProductDetails from "./pages/ProductDetails";
import RegisterProduct from "./pages/RegisterProduct";
import Register from "./pages/Register";
import ConnectWallet from "./pages/ConnectWallet";
import Authenticate from "./pages/Authenticate";
import { AuthFlowProvider } from "./auth/AuthFlowProvider";

function App() {
  return (
    <BrowserRouter>
      <AuthFlowProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<MyProducts />} />
          <Route path="/products/:productId" element={<ProductDetails />} />
          <Route path="/register" element={<Register />} />
          <Route path="/register-product" element={<RegisterProduct />} />
          <Route path="/connect-wallet" element={<ConnectWallet />} />
          <Route path="/authenticate" element={<Authenticate />} />
        </Routes>
      </AuthFlowProvider>
    </BrowserRouter>
  );
}

export default App;