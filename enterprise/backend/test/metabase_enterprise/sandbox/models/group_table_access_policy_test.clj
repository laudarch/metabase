(ns metabase-enterprise.sandbox.models.group-table-access-policy-test
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions-group :as group]
            [toucan.db :as db]))

(deftest normalize-attribute-remappings-test
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (mt/with-temp GroupTableAccessPolicy [gtap {:table_id             (mt/id :venues)
                                                :group_id             (u/get-id (group/all-users))
                                                :attribute_remappings {"venue_id" {:type   "category"
                                                                                   :target ["variable" ["field-id" (mt/id :venues :id)]]
                                                                                   :value  5}}}]
      (is (= {"venue_id" {:type   :category
                          :target [:variable [:field-id (mt/id :venues :id)]]
                          :value  5}}
             (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap)))))

    (testing (str "apparently sometimes they are saved with just the target, but not type or value? Make sure these "
                  "get normalized correctly.")
      (mt/with-temp GroupTableAccessPolicy [gtap {:table_id             (mt/id :venues)
                                                  :group_id             (u/get-id (group/all-users))
                                                  :attribute_remappings {"user" ["variable" ["field-id" (mt/id :venues :id)]]}}]
        (is (= {"user" [:variable [:field-id (mt/id :venues :id)]]}
               (db/select-one-field :attribute_remappings GroupTableAccessPolicy :id (u/get-id gtap))))))))
