import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getServerCurrentUser } from "./services/auth";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminDashboard";

function ProtectedRoute({ children, authUser }) {
  return authUser ? (
    children
  ) : (
    <Navigate to="/login" replace />
  );
}

function AdminRoute({ children, authUser }) {
  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  if (authUser.role !== "admin") {
    return <Navigate to="/home" replace />;
  }

  return children;
}

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    setIsAuthLoading(true);
    const user = await getServerCurrentUser();
    setAuthUser(user);
    setIsAuthLoading(false);
    return user;
  }, []);

  useEffect(() => {
    let mounted = true;

    getServerCurrentUser().then((user) => {
      if (!mounted) return;
      setAuthUser(user);
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (isAuthLoading) {
    return null;
  }

  return (
    <Routes>

      <Route
        path="/"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

      <Route
        path="/login"
        element={<Login onAuthenticated={refreshAuth} />}
      />

      <Route
        path="/signup"
        element={<Signup onAuthenticated={refreshAuth} />}
      />

      <Route
        path="/home"
        element={
          <ProtectedRoute authUser={authUser}>
            <Home authUser={authUser} onLogout={() => setAuthUser(null)} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute authUser={authUser}>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <AdminRoute authUser={authUser}>
            <AdminDashboard authUser={authUser} onLogout={() => setAuthUser(null)} />
          </AdminRoute>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/login"
            replace
          />
        }
      />

    </Routes>
  );
}

export default App;