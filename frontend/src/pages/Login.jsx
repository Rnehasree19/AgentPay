import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { login } from "../services/auth";
import { loginWithGoogle } from "../services/googleAuth";
import GoogleButton from "../components/GoogleButton";

function Login({ onAuthenticated }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState(
    location.state?.message || ""
  );

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.email || !form.password) {
      setError(
        "Please enter your email and password."
      );
      return;
    }

    try {
      await login(form.email, form.password);
      const authenticatedUser = await onAuthenticated();
      if (!authenticatedUser) throw new Error("Sign-in did not create a valid server session.");
      navigate(authenticatedUser.role === "admin" ? "/admin" : "/home", { replace: true });
    } catch (error) {
      setError(error.message || "Sign-in failed. Please try again.");
    }
  }

  async function 
  
  
  handleGoogleLogin(credential) {
    try {
      setError("");

      await loginWithGoogle(credential);

      const authenticatedUser = await onAuthenticated();

      if (!authenticatedUser) {
        throw new Error("Google sign-in did not create a valid server session.");
      }

      navigate("/home", {
        replace: true,
      });
    } catch (error) {
      setError(
        error.message ||
          "Google sign-in failed. Please try again."
      );
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">
          A
        </div>

        <h1>Welcome back</h1>

        <p className="auth-subtitle">
          Sign in to continue to AgentPay
        </p>

        <form onSubmit={handleSubmit}>

          <label>Email</label>

          <input
            type="email"
            name="email"
            placeholder="Enter your email"
            value={form.email}
            onChange={handleChange}
          />

          <label>Password</label>

          <input
            type="password"
            name="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={handleChange}
          />

          {error && (
            <p className="form-error">
              {error}
            </p>
          )}

          <button
            className="auth-button"
            type="submit"
          >
            Sign in
          </button>

        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <GoogleButton
          onSuccess={handleGoogleLogin}
        />

        <p className="auth-switch">
          Don't have an account?{" "}

          <Link to="/signup">
            Create account
          </Link>
        </p>

      </div>
    </div>
  );
}

export default Login;