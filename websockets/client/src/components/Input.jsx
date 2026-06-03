import "../App.css";

const Input = ({ placeholder, handleInput, name }) => {
  return (
    <div>
      <input
        className="input-field"
        name={name}
        placeholder={placeholder}
        onChange={handleInput}
      />
    </div>
  );
};

export default Input;
