"use client";

import React from "react";
import "./App.css";
import DesignToolbar from "./designer/DesignToolbar";
import Designer from "./designer/Designer";
import Editor from "./editor/Editor";
import { getModel } from "./pflow";
import { Paper } from "@mui/material";
import { Abi } from "abitype";
import { useContractRead } from "wagmi";
import { DeclarationResult, contractDeclarationToJson } from "~~/app/p/pflow/contract";
import { GenericContract } from "~~/utils/scaffold-eth/contract";
import { getAllContracts } from "~~/utils/scaffold-eth/contractsData";

function declarationContracts(): GenericContract[] {
  const contractsData = getAllContracts();
  return Object.values(contractsData).filter(contract => {
    return contract.abi.filter(part => part.type === "function" && part.name === "declaration");
  });
}

const PflowEditorPage: React.FC = () => {
  const metaModel = getModel();
  const [modelVersion, modelUpdated] = React.useState(0);
  metaModel.onUpdate(() => modelUpdated(modelVersion ? 0 : 1));

  const pflowContracts = declarationContracts();
  const contract = pflowContracts[0] || undefined;

  const result = useContractRead({
    address: contract?.address,
    functionName: "declaration",
    abi: contract?.abi as Abi,
    args: [],
  });

  if (contract) {
    metaModel.setImportedContract(contract?.address);
    metaModel.loadJson(contractDeclarationToJson(result.data as DeclarationResult));
  }

  return (
    <React.Fragment>
      <Paper sx={{ marginBottom: "5px", marginTop: "-64px" }}>
        <Designer metaModel={metaModel} />
        <DesignToolbar metaModel={metaModel} />
      </Paper>
      <Editor metaModel={metaModel} />
    </React.Fragment>
  );
};

export default PflowEditorPage;
