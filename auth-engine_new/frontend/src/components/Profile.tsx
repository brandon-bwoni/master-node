import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

const Profile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    navigate("/");
  };

  return (
    <div className="p-40">
      <div className="h-16 w-full p-8 bg-amber-50 flex justify-end">
        <h1>Welcome {user}</h1>
      </div>
      <div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white font-medium"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Profile;
