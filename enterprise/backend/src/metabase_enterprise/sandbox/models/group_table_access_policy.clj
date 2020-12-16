(ns metabase-enterprise.sandbox.models.group-table-access-policy
  "Model definition for Group Table Access Policy, aka GTAP. A GTAP is useed to control access to a certain Table for a
  certain PermissionsGroup. Whenever a member of that group attempts to query the Table in question, a Saved Question
  specified by the GTAP is instead used as the source of the query."
  (:require [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.normalize :as normalize]
            [metabase.models
             [card :refer [Card]]
             [interface :as i]
             [table :as table]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel GroupTableAccessPolicy :group_table_access_policy)

(defn- normalize-attribute-remapping-targets [attribute-remappings]
  (m/map-vals
   (fn [target]
     (if (map? target)
       (normalize/normalize-tokens (walk/keywordize-keys target) [:parameters :metabase.mbql.normalize/sequence])
       (normalize/normalize-tokens target :ignore-path)))
   attribute-remappings))

;; for GTAPs
(models/add-type! ::attribute-remappings
  :in  (comp i/json-in normalize-attribute-remapping-targets)
  :out (comp normalize-attribute-remapping-targets i/json-out-without-keywordization))

(defn- check-columns-match-table
  "Make sure the result metadata data columns for the Card associated with a GTAP match up with the columns in the Table
  that's getting GTAPped. It's ok to remove columns, but you cannot add new columns. The base types of the Card
  columns can derive from the respective base types of the columns in the Table itself, but you cannot return an
  entirely different type."
  [{card-id :card_id, table-id :table_id, :as gtap}]
  ;; not all GTAPs have Cards
  (when card-id
    ;; not all Cards have saved result metadata
    (when-let [result-metadata (db/select-one-field :result_metadata Card :id card-id)]
      ;; prevent circular refs
      (classloader/require 'metabase.query-processor)
      (let [table-cols (into {} (for [col ((resolve 'metabase.query-processor/query->expected-cols)
                                           {:database (table/table-id->database-id table-id)
                                            :type     :query
                                            :query    {:source-table table-id}})]
                                  [(:name col) col]))]
        (doseq [col  result-metadata
                :let [table-col-base-type (get-in table-cols [(:name col) :base_type])]]
          (when-not table-col-base-type
            (throw (ex-info (trs "Sandbox Cards can''t return columns that aren't present in the Table they are sandboxing.")
                            {:new-column col
                             :expected   (mapv :name table-cols)
                             :actual     (mapv :name result-metadata)})))
          (when-not (isa? (keyword (:base_type col)) table-col-base-type)
            (throw (ex-info (trs "Sandbox Cards can''t return columns that have different types than the Table they are sandboxing.")
                            {:new-col  col
                             :expected table-col-base-type
                             :actual   (:base_type col)}))))))))

(defn- pre-insert [gtap]
  (u/prog1 gtap
    (check-columns-match-table gtap)))

(defn- pre-update [gtap]
  (u/prog1 gtap
    (check-columns-match-table gtap)))

(u/strict-extend (class GroupTableAccessPolicy)
  models/IModel
  (merge
   models/IModelDefaults
   {:types      (constantly {:attribute_remappings ::attribute-remappings})
    :pre-insert pre-insert
    :pre-update pre-update})

  ;; only admins can work with GTAPs
  i/IObjectPermissions
  (merge
   i/IObjectPermissionsDefaults
   {:can-read?  i/superuser?
    :can-write? i/superuser?}))
