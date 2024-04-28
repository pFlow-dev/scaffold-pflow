import React from "react";
import { MetaModel } from "../../pflow";
import { FormGroup, Grid, TextField } from "@mui/material";

export default function History(props: { metaModel: MetaModel }) {
  const history = props.metaModel.stream.history;
  const entries = [];

  for (const i in history) {
    const val = history[i];
    entries.unshift(
      <FormGroup row key={"history" + val.seq}>
        <TextField
          sx={{ marginTop: "5px", width: "20em" }}
          label={val.seq}
          key={"history" + val.seq}
          value={val.event.action}
        />
      </FormGroup>,
    );
  }

  return (
    <React.Fragment>
      <Grid container spacing={2}>
        <Grid item xs={12} md={12}>
          {entries}
        </Grid>
      </Grid>
    </React.Fragment>
  );
}
