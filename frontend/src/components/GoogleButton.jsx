import { useEffect, useRef } from "react";

const GOOGLE_CLIENT_ID =
  "242838579695-tl0md0m7orv0vhrgge0215m80c9o6n4b.apps.googleusercontent.com";

function GoogleButton({ onSuccess }) {
  const buttonRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    function renderGoogleButton() {
      if (
        !window.google ||
        !buttonRef.current ||
        initializedRef.current
      ) {
        return;
      }

      initializedRef.current = true;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          onSuccess(response.credential);
        },
      });

      window.google.accounts.id.renderButton(
        buttonRef.current,
        {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: 350,
        }
      );
    }

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const interval = setInterval(() => {
      if (window.google) {
        clearInterval(interval);
        renderGoogleButton();
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [onSuccess]);

  return (
    <div className="google-button-container">
      <div ref={buttonRef}></div>
    </div>
  );
}

export default GoogleButton;