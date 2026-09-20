import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminUsers, logoutServer } from "../services/auth";

function AdminDashboard({ authUser, onLogout }) {
  const navigate = useNavigate();
  const admin = authUser;

  const [users, setUsers] = useState([]);

  useEffect(() => {
    let mounted = true;

    getAdminUsers()
      .then((loadedUsers) => {
        if (mounted) setUsers(loadedUsers);
      })
      .catch(() => {
        if (mounted) setUsers([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!admin || admin.role !== "admin") {
    navigate("/login");
    return null;
  }

  async function handleLogout() {
    await logoutServer();
    onLogout();
    navigate("/login");
  }

  return (
    <div className="admin-dashboard">

      <header className="admin-header">
        <div>
          <h1>AgentPay Admin</h1>
          <p>Admin Dashboard</p>
        </div>

        <button
          className="admin-logout"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <main className="admin-content">

        <div className="admin-welcome">
          <h2>Welcome, Admin</h2>
          <p>
            Manage and view AgentPay users.
          </p>
        </div>

        <div className="admin-stats">
          <div className="admin-card">
            <span>Total Users</span>
            <strong>{users.length}</strong>
          </div>

          <div className="admin-card">
            <span>Admin</span>
            <strong>1</strong>
          </div>
        </div>

        <section className="users-section">

          <div className="section-header">
            <h2>All Users</h2>
            <span>{users.length} users</span>
          </div>

          {users.length === 0 ? (
            <div className="empty-users">
              No users registered yet.
            </div>
          ) : (
            <div className="users-table">

              <div className="table-row table-header">
                <span>Name</span>
                <span>Email</span>
                <span>User ID</span>
                <span>Joined</span>
              </div>

              {users.map((user) => (
                <div
                  className="table-row"
                  key={user.id}
                >
                  <span>{user.name}</span>

                  <span>{user.email}</span>

                  <span>{user.id}</span>

                  <span>
                    {user.createdAt
                      ? new Date(
                          user.createdAt
                        ).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
              ))}

            </div>
          )}

        </section>

      </main>
    </div>
  );
}

export default AdminDashboard;