import { Link } from "react-router-dom";

const HomePage = () => {
  return (
    <div className="h-20 bg-amber-50 flex justify-center items-center">
      <nav className="flex space-x-16 justify-center items-center">
        <Link
          to="/login"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Login
          </button>
        </Link>
        <Link
          to="/register"
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Register
        </Link>
      </nav>
    </div>
  );
};

export default HomePage;
