import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom'
import Canvas2 from './components/Canvas2'
import Login from './pages/Login/Login'
import Home from './pages/Home/Home'
import './App.css'
import { AuthProvider } from './components/Auth/Auth'

function App() {

  return (
    <AuthProvider>
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/canvas2" element={<Canvas2 />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
    </AuthProvider>
  )
}

export default App
