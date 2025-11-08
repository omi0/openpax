import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'
import { Canvas } from './components/canvas'
import Canvas2 from './components/Canvas2'
import './App.css'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/canvas" element={<Canvas />} />
        <Route path="/canvas2" element={<Canvas2 />} />
      </Routes>
    </Router>
  )
}

export default App
