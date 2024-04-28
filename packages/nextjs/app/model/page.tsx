"use client";

import React from "react";
import "./App.css";
import { Paper } from "@mui/material";
import { Abi } from "abitype";
import { useContractRead } from "wagmi";
import DesignToolbar from "~~/components/designer/DesignToolbar";
import Designer from "~~/components/designer/Designer";
import Editor from "~~/components/editor/Editor";
import { MetaModel } from "~~/pflow";
import { DeclarationResult, contractDeclarationToJson } from "~~/pflow/contract";
import { GenericContract } from "~~/utils/scaffold-eth/contract";
import { getAllContracts } from "~~/utils/scaffold-eth/contractsData";

function declarationContracts(): GenericContract[] {
  const contractsData = getAllContracts();
  return Object.values(contractsData).filter(contract => {
    return contract.abi.filter(part => part.type === "function" && part.name === "declaration");
  });
}

const metaModel = new MetaModel();

const PflowEditorPage: React.FC = () => {
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

  if (result && contract) {
    metaModel.setImportedContract(contract?.address);
    if (result.data) {
      metaModel.loadJson(contractDeclarationToJson(result.data as DeclarationResult));
    }
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
