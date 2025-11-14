import Navbar from "../../components/Navbar/Navbar";
import "./Home.css";

export default function Home() {
    return (
        <>
            <Navbar />
        
            <div className="home-container">
                <h1>Welcome to the Restaurant Manager</h1>
                <p>Lorem Ipsum.</p>
            </div>
        </>
    );
}
