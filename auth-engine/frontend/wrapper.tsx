import { Navigate } from "react-router-dom";

export const ProtectedRoute = ({ children }) => {
  const isLoggedIn = false;
  return isLoggedIn ? children : <Navigate to="/login" />;
};
