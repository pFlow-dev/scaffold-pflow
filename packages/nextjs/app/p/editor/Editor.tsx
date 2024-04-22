import React from "react";
import { MetaModel } from "../pflow";
import History from "./History";
import Place from "./Place";
import Source from "./Source";
import Transition from "./Transition";
import { Box, Paper } from "@mui/material";

interface EditorProps {
  metaModel: MetaModel;
}

export default function Editor(props: EditorProps): React.ReactElement {
  const { metaModel } = props;
  const selectedObj = metaModel.getCurrentObj();
  const marginTop = "1em";
  const marginLeft = "1em";
  if (metaModel.mode === "execute") {
    return (
      <React.Fragment>
        <Box sx={{ marginTop, marginLeft }}>
          <Paper sx={{ padding: "5px" }}>
            <History metaModel={metaModel} />
          </Paper>
        </Box>
      </React.Fragment>
    );
  }

  if (!selectedObj) {
    return (
      <React.Fragment>
        <Box sx={{ m: 2 }}>
          <Source metaModel={metaModel} />
        </Box>
      </React.Fragment>
    );
  }

  switch (selectedObj.metaType) {
    case "place": {
      return (
        <React.Fragment>
          <Box sx={{ marginTop, marginLeft }}>
            <Paper sx={{ padding: "5px" }}>
              <Place selectedObj={selectedObj} metaModel={props.metaModel} />
            </Paper>
          </Box>
        </React.Fragment>
      );
    }
    case "transition": {
      return (
        <React.Fragment>
          <Box sx={{ marginTop, marginLeft }}>
            <Paper sx={{ padding: "5px" }}>
              <Transition selectedObj={selectedObj} metaModel={props.metaModel} />
            </Paper>
          </Box>
        </React.Fragment>
      );
    }
    default: {
      return (
        <React.Fragment>
          <Box sx={{ m: 2 }}>
            <Source metaModel={props.metaModel} />
          </Box>
        </React.Fragment>
      );
    }
  }
}
