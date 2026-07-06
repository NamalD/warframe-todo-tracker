import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import ItemsList from './pages/ItemsList';
import ItemDetail from './pages/ItemDetail';
import Sources from './pages/Sources';
import Todos from './pages/Todos';

function App() {
  return (
    <div className="app">
      <nav className="site-nav">
        <div className="nav-inner">
          <strong className="brand">Warframe Tracker</strong>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Home</NavLink>
            <NavLink to="/items" className={({ isActive }) => (isActive ? 'active' : '')}>Items</NavLink>
            <NavLink to="/sources" className={({ isActive }) => (isActive ? 'active' : '')}>Sources</NavLink>
            <NavLink to="/todos" className={({ isActive }) => (isActive ? 'active' : '')}>Todos</NavLink>
          </div>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/items" element={<ItemsList />} />
          <Route path="/items/:id" element={<ItemDetail />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/todos" element={<Todos />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
