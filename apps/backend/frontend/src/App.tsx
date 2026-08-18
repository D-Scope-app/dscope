import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/layout";
import { Footer } from "./components/layout";
import { Landing } from "./pages/Landing";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Landing />} />
            {/* TODO: Add other routes */}
            {/* <Route path="/create" element={<CreateSurvey />} /> */}
            {/* <Route path="/surveys/:id" element={<Dashboard />} /> */}
            {/* <Route path="/surveys/:id/participate" element={<Participate />} /> */}
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
