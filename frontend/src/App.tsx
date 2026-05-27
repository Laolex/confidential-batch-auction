import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/app/layout/Layout";
import { Home } from "@/pages/Home";
import { MarketDetail } from "@/pages/MarketDetail";
import { CreateMarket } from "@/pages/CreateMarket";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="market/:id" element={<MarketDetail />} />
          <Route path="create" element={<CreateMarket />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
