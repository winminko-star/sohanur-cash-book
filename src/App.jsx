import { useState } from "react";

import Login from "./components/Login";
import Home from "./pages/Home";

export default function App() {

  const [login,setLogin]=useState(
    localStorage.getItem("cashbook_login")==="true"
  );

  if(!login){

    return(
      <Login onLogin={()=>setLogin(true)}/>
    );

  }

  return <Home/>;

}
