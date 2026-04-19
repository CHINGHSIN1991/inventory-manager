import { Router, Route } from "@solidjs/router";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductListPage } from "./pages/ProductListPage";
import { ProductFormPage } from "./pages/ProductFormPage";
import { StockInPage } from "./pages/StockInPage";
import { StockOutPage } from "./pages/StockOutPage";
import { StockHistoryPage } from "./pages/StockHistoryPage";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route
          path="/"
          component={(props) => (
            <AuthGuard>
              <AppLayout>{props.children}</AppLayout>
            </AuthGuard>
          )}
        >
          <Route path="/" component={DashboardPage} />
          <Route path="/products" component={ProductListPage} />
          <Route path="/products/new" component={ProductFormPage} />
          <Route path="/products/:id/edit" component={ProductFormPage} />
          <Route path="/stock/in" component={StockInPage} />
          <Route path="/stock/out" component={StockOutPage} />
          <Route path="/stock/history" component={StockHistoryPage} />
        </Route>
      </Router>
    </AuthProvider>
  );
}
