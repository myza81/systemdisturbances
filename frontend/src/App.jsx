import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Disturbances from './pages/Disturbances';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Disturbances />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
