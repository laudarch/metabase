(ns metabase-enterprise.sandbox.models.group-table-access-policy-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.models.permissions-group :as group]
            [toucan.db :as db]))

(deftest normalize-attribute-remappings-test
  (testing "make sure attribute-remappings come back from the DB normalized the way we'd expect"
    (mt/with-temp GroupTableAccessPolicy [gtap {:table_id             (mt/id :venues)
                                                :group_id             (u/get-id (group/all-users))
                                                :attribute_remappings {"venue_id"
                                                                       {:type   "category"
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

(deftest constraint-sandboxing-queries-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (letfn [(create-venues-gtap-for-card-with-query! [query]
              (mt/with-temp* [Card                   [card {:dataset_query   query
                                                            :result_metadata (qp/query->expected-cols query)}]
                              GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                            :group_id (u/get-id (group/all-users))
                                                            :card_id  (:id card)}]]
                :ok))]
      (testing "sanity check"
        (is (= :ok
               (create-venues-gtap-for-card-with-query! (mt/mbql-query venues)))))
      (testing "adding new columns = not ok"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Sandbox Cards can't return columns that arent present in the Table they are sandboxing"
             (create-venues-gtap-for-card-with-query! (mt/mbql-query checkins)))))
      (testing "removing columns = ok"
        (is (= :ok
               (create-venues-gtap-for-card-with-query! (mt/mbql-query venues {:fields [$id $name]})))))
      (testing "changing order of columns = ok"
        (is (= :ok
               (create-venues-gtap-for-card-with-query!
                (mt/mbql-query venues
                  {:fields (for [id (shuffle (map :id (qp/query->expected-cols (mt/mbql-query venues))))]
                             [:field-id id])}))))))

    (letfn [(create-venues-gtap-for-card-with-metadata! [metadata]
              (mt/with-temp* [Card                   [card {:dataset_query   (mt/mbql-query :venues)
                                                            :result_metadata metadata}]
                              GroupTableAccessPolicy [gtap {:table_id (mt/id :venues)
                                                            :group_id (u/get-id (group/all-users))
                                                            :card_id  (:id card)}]]
                :ok))]
      (testing "should throw an Exception if the *type* of the column changes"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Sandbox Cards can't return columns that have different types than the Table they are sandboxing"
             (create-venues-gtap-for-card-with-metadata!
              (-> (vec (qp/query->expected-cols (mt/mbql-query venues)))
                  (assoc-in [0 :base_type] :type/Text))))))
      (testing "type changes to a descendant type = ok"
        (is (= :ok
               (create-venues-gtap-for-card-with-metadata!
                (-> (vec (qp/query->expected-cols (mt/mbql-query venues)))
                    (assoc-in [0 :base_type] :type/BigInteger)))))))))
