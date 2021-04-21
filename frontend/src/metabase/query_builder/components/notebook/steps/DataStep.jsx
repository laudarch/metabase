import React from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { NotebookCell, NotebookCellItem } from "../NotebookCell";

import { getDatabasesList } from "metabase/query_builder/selectors";

function DataStep({ color, query, databases, updateQuery }) {
  const table = query.table();
  return (
    <NotebookCell color={color}>
      <DatabaseSchemaAndTableDataSelector
        databaseQuery={{ saved: true }}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={query.tableId()}
        setSourceTableFn={tableId =>
          query
            .setTableId(tableId)
            .setDefaultQuery()
            .update(updateQuery)
        }
        isInitiallyOpen={!query.tableId()}
        triggerElement={
          !query.tableId() ? (
            <NotebookCellItem color={color} inactive>
              {t`Pick your starting data`}
            </NotebookCellItem>
          ) : (
            <NotebookCellItem color={color} icon="table2">
              {table && table.displayName()}
            </NotebookCellItem>
          )
        }
      />
      {table && query.isRaw() && (
        <DataFieldsPicker
          className="ml-auto mb1 text-bold"
          query={query}
          updateQuery={updateQuery}
        />
      )}
    </NotebookCell>
  );
}

export default connect(state => ({ databases: getDatabasesList(state) }))(
  DataStep,
);

import FieldsPicker from "./FieldsPicker";

var isset = false;
const selected = []
const DataFieldsPicker = ({ className, query, updateQuery }) => {
  const dimensions = query.tableDimensions();
  const selectedDimensions = query.columnDimensions();
  console.log(selectedDimensions);

  window.a = selectedDimensions;

  console.log("is  new "+isset);

  function removeAll(originalSet, toBeRemovedSet) {
    [...toBeRemovedSet].forEach(function(v) {
      originalSet.delete(v);
    });
  }

  function doExist(obj) {

    for (var i=0;i<selected.length;i++) {
      if (obj._args[0] === selected[i]._args[0]) {
        selected.splice(i,1);
        return true;
      }
    }
    return false;
  }



  return (
    <FieldsPicker
      className={className}
      dimensions={dimensions}
      selectedDimensions={selected}
      isNone={true}
      onSelectAll={() => {

        selected.splice(0,selected.length);
        let aa = selected
          .map(d => d.mbql());

        query
          .setFields(
            aa
          )
          .update(updateQuery);

      }
      }
      isAll={true}
      onSelectNone={() => {
        // query.setFields("").update(updateQuery);
        // isset = false;

        selected.splice(0,selected.length);

        let aa = selected
          .map(d => d.mbql());

        query
          .setFields(
            aa
          )
          .update(updateQuery);


      }}
      onToggleDimension={(dimension, enable) => {

        console.log("update query");
        console.log(updateQuery);

        console.log(" query");
        console.log(query);

        isset = true;


        //if dimension is selected we add it
        if (doExist(dimension)) {
          console.log("exist")
        }else {
          selected.push(dimension);
        }

        console.log("selected");
        console.log(selected);
        console.log(dimension);


        let dd = selected
          .map(d => d.mbql());


        console.log("dimensions are "+dd);

        query
          .setFields(
            dd
          )
          .update(updateQuery);
      }}
    />
  );
};
