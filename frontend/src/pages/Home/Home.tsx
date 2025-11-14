import { useEffect } from "react";
import { useAuth } from "../../components/Auth/useAuth";
import Navbar from "../../components/Navbar/Navbar";
import "./Home.css";
import { useNavigate } from 'react-router-dom';

export default function Home() {

    const { accessToken } = useAuth();
    const navigate = useNavigate();


    useEffect(() => {
        if (!accessToken) navigate("/login");
    });

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
