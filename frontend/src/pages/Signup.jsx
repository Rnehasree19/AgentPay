import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signup } from "../services/auth";

function Signup({ onAuthenticated }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [error, setError] = useState("");

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });

    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const {
      name,
      email,
      password,
      confirmPassword,
    } = form;

    if (
      !name ||
      !email ||
      !password ||
      !confirmPassword
    ) {
      setError("Please fill in all fields.");
      return;
    }

    if (password.length < 6) {
      setError(
        "Password must contain at least 6 characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await signup({ name, email, password });
      const authenticatedUser = await onAuthenticated();
      if (!authenticatedUser) throw new Error("Account creation did not create a valid server session.");
      navigate("/home", { replace: true });
    } catch (error) {
      setError(error.message || "Account creation failed. Please try again.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">

        <div className="auth-logo">A</div>

        <h1>Create account</h1>

        <p className="auth-subtitle">
          Create your AgentPay account
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          <label>Name</label>

          <input
            type="text"
            name="name"
            placeholder="Enter your name"
            value={form.name}
            onChange={handleChange}
          />

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
            placeholder="Minimum 6 characters"
            value={form.password}
            onChange={handleChange}
          />

          <label>Confirm password</label>

          <input
            type="password"
            name="confirmPassword"
            placeholder="Re-enter your password"
            value={form.confirmPassword}
            onChange={handleChange}
          />

          {error && (
            <p className="auth-error">
              {error}
            </p>
          )}

          <button
            className="auth-button"
            type="submit"
          >
            Create account
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{" "}
          <Link to="/login">
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}

export default Signup;