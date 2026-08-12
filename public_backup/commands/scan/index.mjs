import { type } from "../../io.js";


if (!localStorage.getItem("helpRepaired")){
    type("ERROR: COMMAND CORRUPTED PLEASE RUN 'REPAIR' TO FIX DAMAGE FILES")
}

if (localStorage.getItem("helpRepaired")){
    
}