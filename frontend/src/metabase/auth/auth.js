import {
  handleActions,
  combineReducers,
  createThunkAction,
} from "metabase/lib/redux";

import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { clearGoogleAuthCredentials } from "metabase/lib/auth";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";

import { SessionApi,StakeHoldersAPI } from "metabase/services";

// login
export const LOGIN = "metabase/auth/LOGIN";
export const login = createThunkAction(
  LOGIN,
  (credentials, redirectUrl) => async (dispatch, getState) => {
    // NOTE: this request will return a Set-Cookie header for the session
    console.log(credentials);

    if (credentials.username === "laudarch@home.gh") {
      await SessionApi.create(credentials);
      MetabaseAnalytics.trackEvent("Auth", "Login");
      await Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(refreshSiteSettings()),
      ]);
      dispatch(push(redirectUrl || "/"));

    }else {
      var res = await fetch("/api/session/stakeholder/login",{
        method: "POST",
        body: JSON.stringify(credentials),
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });

      let email = credentials.username+"@icums.gov.gh";

      var dataRes = JSON.parse((await res.json()).response);

      if (dataRes.code !== 1 ) {
        throw new Error(dataRes.message);
      }

      res = await fetch("/api/session/new/user",{
        method: "POST",
        body: JSON.stringify({
          "first_name": dataRes.data.FullName.split(" ")[0],
          "last_name": dataRes.data.FullName.replace(dataRes.data.FullName.split(" ")[0],""),
          "email": email,
          "password": credentials.password
        }),
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "X-Metabase-Session": "ed952d85-8b53-4c59-b5cd-cb718ffe0520",
         },
      });

      try {
        dataRes = (await res.json());
        console.log(dataRes);
        if (dataRes.errors !== undefined) {
          //user already exist

        }
      }catch (e) {
        throw new Error("Error");
      }

      console.log("all done");
      credentials.username = email;


      await SessionApi.create(credentials);
      MetabaseAnalytics.trackEvent("Auth", "Login");
      await Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(refreshSiteSettings()),
      ]);
      dispatch(push(redirectUrl || "/"));
    }


  },
);

// login Google
export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createThunkAction(LOGIN_GOOGLE, function(
  googleUser,
  redirectUrl,
) {
  return async function(dispatch, getState) {
    try {
      // NOTE: this request will return a Set-Cookie header for the session
      await SessionApi.createWithGoogleAuth({
        token: googleUser.getAuthResponse().id_token,
      });

      MetabaseAnalytics.trackEvent("Auth", "Google Auth Login");

      await Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(refreshSiteSettings()),
      ]);
      dispatch(push(redirectUrl || "/"));
    } catch (error) {
      await clearGoogleAuthCredentials();
      // If we see a 428 ("Precondition Required") that means we need to show the "No Metabase account exists for this Google Account" page
      if (error.status === 428) {
        dispatch(push("/auth/google_no_mb_account"));
      } else {
        return error;
      }
    }
  };
});

// logout
export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createThunkAction(LOGOUT, function() {
  return async function(dispatch, getState) {
    // actively delete the session and remove the cookie
    await SessionApi.delete();

    // clear Google auth credentials if any are present
    await clearGoogleAuthCredentials();

    MetabaseAnalytics.trackEvent("Auth", "Logout");

    dispatch(push("/auth/login"));

    // refresh to ensure all application state is cleared
    window.location.reload();
  };
});

// reducers

const loginError = handleActions(
  {
    [LOGIN_GOOGLE]: {
      next: (state, { payload }) => (payload ? payload : null),
    },
  },
  null,
);

export default combineReducers({
  loginError,
});
