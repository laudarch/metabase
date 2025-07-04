(ns metabase.driver.impl
  "Internal implementation functions for [[metabase.driver]]. These functions live in a separate namespace to reduce the
  clutter in [[metabase.driver]] itself."
  #_{:clj-kondo/ignore [:metabase/modules]}
  (:require
   [metabase.classloader.impl :as classloader]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Hierarchy ----------------------------------------------------

(defonce ^{:doc "Driver hierarchy. Used by driver multimethods for dispatch. Add new drivers with `register!`."}
  hierarchy
  (make-hierarchy))

(defonce ^{:doc "To find out whether a driver has been registered, we need to wait until any current driver-loading
  operations have finished. Otherwise we can get a \"false positive\" -- see #13114.

  To see whether a driver is registered, we only need to obtain a *read lock* -- multiple threads can have these at
  once, and they only block if a write lock is held or if a thread is waiting for one (see dox
  for [[ReentrantReadWriteLock]] for more details.)

  If we're currently in the process of loading a driver namespace, obtain the *write lock* which will prevent other
 threads from obtaining read locks until it finishes."} ^:private ^ReentrantReadWriteLock load-driver-lock
  (ReentrantReadWriteLock.))

(defmacro ^:private with-load-driver-read-lock [& body]
  `(try
     (.. load-driver-lock readLock lock)
     ~@body
     (finally
       (.. load-driver-lock readLock unlock))))

(defmacro ^:private with-load-driver-write-lock [& body]
  `(try
     (.. load-driver-lock writeLock lock)
     ~@body
     (finally
       (.. load-driver-lock writeLock unlock))))

(defn registered?
  "Is `driver` a valid registered driver?"
  [driver]
  (with-load-driver-read-lock
    (isa? hierarchy (keyword driver) :metabase.driver/driver)))

(defn concrete?
  "Is `driver` registered, and non-abstract?"
  [driver]
  (isa? hierarchy (keyword driver) ::concrete))

(defn abstract?
  "Is `driver` an abstract \"base class\"? i.e. a driver that you cannot use directly when adding a Database, such as
  `:sql` or `:sql-jdbc`."
  [driver]
  (not (concrete? driver)))

;;; -------------------------------------------- Loading Driver Namespace --------------------------------------------

(mu/defn- driver->expected-namespace [driver :- :keyword]
  (symbol
   (or (namespace driver)
       (str "metabase.driver." (name driver)))))

(defn- require-driver-ns
  "`require` a driver's 'expected' namespace."
  [driver & require-options]
  (let [expected-ns (driver->expected-namespace driver)]
    (log/debugf "Loading driver %s %s" (u/format-color 'blue driver) (apply list 'require expected-ns require-options))
    (try
      (apply classloader/require expected-ns require-options)
      (catch Throwable e
        (log/error e "Error loading driver namespace")
        (throw (Exception. (tru "Could not load {0} driver." driver) e))))))

(defn load-driver-namespace-if-needed!
  "Load the expected namespace for a `driver` if it has not already been registed. This only works for core Metabase
  drivers, whose namespaces follow an expected pattern; drivers provided by 3rd-party plugins are expected to register
  themselves in their plugin initialization code.

  You should almost never need to do this directly; it is handled automatically when dispatching on a driver and by
  `register!` below (for parent drivers) and by `driver.u/database->driver` for drivers that have not yet been
  loaded."
  [driver]
  (when-not *compile-files*
    (when-not (registered? driver)
      (with-load-driver-write-lock
        ;; driver may have become registered while we were waiting for the lock, check again to be sure
        (when-not (registered? driver)
          (classloader/the-classloader) ;; Ensure the classloader is properly set before loading namespaces.
          (u/profile (trs "Load driver {0}" driver)
            (require-driver-ns driver)
            ;; ok, hopefully it was registered now. If not, try again, but reload the entire driver namespace
            (when-not (registered? driver)
              (require-driver-ns driver :reload)
              ;; if *still* not registered, throw an Exception
              (when-not (registered? driver)
                (throw (Exception. (tru "Driver not registered after loading: {0}" driver)))))))))))

;;; -------------------------------------------------- Registration --------------------------------------------------

(defn check-abstractness-hasnt-changed
  "Check to make sure we're not trying to change the abstractness of an already registered driver"
  [driver new-abstract?]
  (when (registered? driver)
    (let [old-abstract? (boolean (abstract? driver))
          new-abstract? (boolean new-abstract?)]
      (when (not= old-abstract? new-abstract?)
        (throw (Exception. (tru "Error: attempting to change {0} property `:abstract?` from {1} to {2}."
                                driver old-abstract? new-abstract?)))))))

(defn register!
  "Register a driver.

    (register! :sql, :abstract? true)

    (register! :postgres, :parent :sql-jdbc)

  Valid options are:

  ###### `:parent` (default = none)

  Parent driver(s) to derive from. Drivers inherit method implementations from their parents similar to the way
  inheritance works in OOP. Specify multiple direct parents by passing a collection of parents.

  You can add additional parents to a driver using [[metabase.driver/add-parent!]]; this is how test extensions are
  implemented.

  ###### `:abstract?` (default = false)

  Is this an abstract driver (i.e. should we hide it in the admin interface, and disallow running queries with it)?

  Note that because concreteness is implemented as part of our keyword hierarchy it is not currently possible to
  create an abstract driver with a concrete driver as its parent, since it would still ultimately derive from
  `::concrete`."
  [driver & {:keys [parent abstract?]}]
  {:pre [(keyword? driver)]}
  ;; no-op during compilation.
  (when-not *compile-files*
    (let [parents (filter some? (u/one-or-many parent))]
      ;; load parents as needed; if this is an abstract driver make sure parents aren't concrete
      (doseq [parent parents]
        (load-driver-namespace-if-needed! parent))
      (when abstract?
        (doseq [parent parents
                :when  (concrete? parent)]
          (throw (ex-info (trs "Abstract drivers cannot derive from concrete parent drivers.")
                          {:driver driver, :parent parent}))))
      ;; validate that the registration isn't stomping on things
      (check-abstractness-hasnt-changed driver abstract?)
      ;; ok, if that was successful we can derive the driver from `:metabase.driver/driver`/`::concrete` and parent(s)
      (let [derive! (partial alter-var-root #'hierarchy derive driver)]
        (derive! :metabase.driver/driver)
        (when-not abstract?
          (derive! ::concrete))
        (doseq [parent parents]
          (derive! parent)))
      ;; ok, log our great success
      (log/info
       (u/format-color 'blue
                       (format (if (metabase.driver.impl/abstract? driver)
                                 "Registered abstract driver %s"
                                 "Registered driver %s")
                               driver))
       (if (seq parents)
         (format "(parents: %s)" (vec parents))
         "")
       (u/emoji "🚚")))))

;;; ------------------------------------------------- Initialization -------------------------------------------------

;; We'll keep track of which drivers are initialized using a set rather than adding a special key to the hierarchy or
;; something like that -- we don't want child drivers to inherit initialized status from their ancestors
(defonce ^:private initialized-drivers
  ;; For the purposes of this exercise the special keywords used in the hierarchy should always be assumed to be
  ;; initialized so we don't try to call initialize on them, which of course would try to load their namespaces when
  ;; dispatching off `the-driver`; that would fail, so don't try it
  (atom #{:metabase.driver/driver ::concrete}))

(defn initialized?
  "Has `driver` been initialized? (See [[metabase.driver/initialize!]] for a discussion of what exactly this means.)"
  [driver]
  (@initialized-drivers driver))

(defonce ^:private initialization-lock (Object.))

(defn initialize-if-needed!
  "Initialize a driver by calling executing `(init-fn driver)` if it hasn't yet been initialized. Refer to documentation
  for [[metabase.driver/initialize!]] for a full explanation of what this means."
  [driver init-fn]
  ;; no-op during compilation
  (when-not *compile-files*
    (when-not (initialized? driver)
      ;; if the driver is not yet initialized, acquire an exclusive lock for THIS THREAD to perform initialization to
      ;; make sure no other thread tries to initialize it at the same time
      (locking initialization-lock
        ;; and once we acquire the lock, check one more time to make sure the driver didn't get initialized by
        ;; whatever thread(s) we were waiting on.
        (when-not (initialized? driver)
          ;; first, initialize parents as needed
          (doseq [parent (parents hierarchy driver)]
            (initialize-if-needed! parent init-fn))
          (log/info (u/format-color :yellow "Initializing driver %s..." driver))
          (log/debug "Reason:" (u/pprint-to-str :blue (drop 5 (u/filtered-stacktrace (Thread/currentThread)))))
          (init-fn driver)
          (swap! initialized-drivers conj driver))))))

;;; ----------------------------------------------- [[truncate-alias]] -----------------------------------------------

(def default-alias-max-length-bytes
  "Default length to truncate column and table identifiers to for the default implementation
  of [[metabase.driver/escape-alias]]."
  ;; Postgres' limit is 63 bytes -- see
  ;; https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS so we'll limit the
  ;; identifiers we generate to 60 bytes so we have room to add `_2` and stuff without drama
  60)

(defn truncate-alias
  "Truncate string `s` if it is longer than `max-length-bytes` (default [[default-alias-max-length-bytes]]) and append a
  hex-encoded CRC-32 checksum of the original string. Truncated string is truncated to `max-length-bytes`
  minus [[truncated-alias-hash-suffix-length]] characters so the resulting string is exactly `max-length-bytes`. The
  goal here is that two really long strings that only differ at the end will still have different resulting values.

    (truncate-alias \"some_really_long_string\" 15) ;   -> \"some_r_8e0f9bc2\"
    (truncate-alias \"some_really_long_string_2\" 15) ; -> \"some_r_2a3c73eb\""
  (^String [s]
   (truncate-alias s default-alias-max-length-bytes))

  (^String [^String s max-length-bytes]
   (lib.util/truncate-alias s max-length-bytes)))
