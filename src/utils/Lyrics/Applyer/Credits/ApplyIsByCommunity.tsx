import { createTooltip } from "../../../tooltip.ts";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";
import {
  closeProfileModal,
  profilePageUrl,
  resolveProfileAvatar,
  resolveProfileIdentity,
  resolveProfileUsername,
  showProfileModal,
} from "../../../../components/ReactComponents/ProfileCard/ProfileCardModal.tsx";
import { GetLyricsFooterDetails, PinFooterDetailWithoutWriters } from "./CreateLyricsFooter.ts";
import { $communityLyricsUseDisplayName, $openProfilesInBrowser } from "../../../../utils/stores.ts";
import type { UnisonCredit } from "../../Sources/Unison.ts";
import { fetchUnisonProfile } from "../../../../components/ReactComponents/ProfileCard/UnisonProfile.ts";

let isByCommunityAbortController: AbortController | null = null;
let madeTippys = new Set<any>();

export function CleanUpIsByCommunity(closeProfileModal: boolean = false) {
  if (closeProfileModal) {
    closeProfileModal();
  }
  if (isByCommunityAbortController) {
    isByCommunityAbortController.abort();
    isByCommunityAbortController = null;
  }

  madeTippys.forEach((tippy) => {
    if (tippy && typeof tippy.destroy === "function") {
      tippy.destroy();
    }
  });
  madeTippys.clear();
}

/** A Unison submitter, whose card loads from Unison instead of Spicy Lyrics. */
type UnisonProfileTarget = { keyId: string; profileUrl: string };

function openProfile(
  userId: string | undefined,
  profileElement: HTMLElement,
  signal: AbortSignal,
  unison?: UnisonProfileTarget,
) {
  if (!userId || signal.aborted) return;
  if (unison && $openProfilesInBrowser.get()) {
    window.open(unison.profileUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (!unison && $openProfilesInBrowser.get()) {
    void resolveProfileUsername(userId).then((username) => {
      if (!signal.aborted && username) {
        window.open(profilePageUrl(username), "_blank", "noopener,noreferrer");
      }
    });
    return;
  }
  const profileDocument = profileElement.ownerDocument;
  const url = unison?.profileUrl ?? `https://spicylyrics.org/uid/${encodeURIComponent(userId)}`;

  const feedback = profileDocument.createElement("span");
  feedback.className = "sl-profile-feedback";
  const clearFeedback = () => {
    feedback.remove();
    feedback.replaceChildren();
    profileElement.removeAttribute("aria-busy");
  };
  signal.addEventListener("abort", clearFeedback, { once: true });
  showProfileModal(unison ? `unison:${unison.keyId}` : userId, profileDocument, {
    signal,
    load: unison ? (lookup) => fetchUnisonProfile(unison.keyId, lookup) : undefined,
    onState: (state) => {
      clearFeedback();
      if (signal.aborted || state === "closed" || state === "ready") return;
      const status = profileDocument.createElement("span");
      status.setAttribute("role", "status");
      if (state === "loading") {
        profileElement.setAttribute("aria-busy", "true");
        const spinner = profileDocument.createElement("span");
        spinner.className = "sl-profile-loading";
        spinner.setAttribute("aria-hidden", "true");
        status.className = "sl-profile-status-text";
        status.textContent = "Loading profile";
        feedback.append(spinner, status);
      } else {
        status.textContent = "Couldn't load profile here.";
        feedback.appendChild(status);
        const browserLink = profileDocument.createElement("a");
        browserLink.className = "sl-profile-action";
        browserLink.href = url;
        browserLink.target = "_blank";
        browserLink.rel = "noopener noreferrer";
        browserLink.textContent = "Open in browser";
        browserLink.addEventListener("click", () => {
          closeProfileModal(unison ? `unison:${unison.keyId}` : userId);
          clearFeedback();
        }, { signal });
        feedback.appendChild(browserLink);
      }
      profileElement.after(feedback);
    },
  });
}

let PageDocument: Document = document;

// Opens through the main window so popouts use the external browser too.
function openExternalLink(link: HTMLAnchorElement, url: string, signal: AbortSignal) {
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    window.open(url, "_blank", "noopener,noreferrer");
  }, { signal });
}

/**
 * Unison lyrics, credited as its terms ask: "Unison" linked to the song's page there, and the
 * submitter's profile card, built from Unison's own data, with a link to their page there.
 */
function ApplyUnisonCredits(credit: UnisonCredit, LyricsContainer: HTMLElement, signal: AbortSignal): void {
  const songInfoElement = PageDocument.createElement("div");
  songInfoElement.classList.add("SongInfo", "CommunityCredits", "UnisonCredits");
  LyricsContainer.classList.add("FromCommunity");

  const communityNote = PageDocument.createElement("span");
  communityNote.classList.add("SongInfoNote");
  communityNote.textContent = "These lyrics have been provided by the Unison community";
  const communityLead = PageDocument.createElement("span");
  communityLead.classList.add("SongInfoLead");
  const unisonLink = PageDocument.createElement("a");
  unisonLink.classList.add("LyricsProviderViaLink");
  unisonLink.textContent = "Unison";
  openExternalLink(unisonLink, credit.songUrl, signal);
  communityLead.append("Community lyrics (", unisonLink, ")");
  songInfoElement.append(communityNote, communityLead);

  const submitter = credit.submitter;
  if (submitter) {
    const wrapperSpan = PageDocument.createElement("span");
    wrapperSpan.classList.add("Maker");

    const profileLink = PageDocument.createElement("button");
    profileLink.type = "button";
    profileLink.classList.add("song-info-profile-section");
    profileLink.addEventListener("click", () => {
      openProfile(submitter.keyId, profileLink, signal, submitter);
      if (IsPIP) globalThis.focus();
    }, { signal });
    // Spotify's playback shortcut must not cancel a keyboard button press.
    profileLink.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") event.stopPropagation();
    }, { signal });

    const labelSpan = PageDocument.createElement("span");
    labelSpan.classList.add("SongInfoRole");
    labelSpan.textContent = "Made by";
    profileLink.append(labelSpan, " ");

    if (submitter.avatarUrl) {
      const img = PageDocument.createElement("img");
      img.src = submitter.avatarUrl;
      img.alt = "";
      img.onerror = () => {
        img.style.display = "none";
      };
      profileLink.appendChild(img);
    }

    const nameSpan = PageDocument.createElement("span");
    nameSpan.classList.add("SongInfoName");
    const usernameSpan = PageDocument.createElement("span");
    usernameSpan.textContent = submitter.displayName;
    nameSpan.append(usernameSpan);
    profileLink.appendChild(nameSpan);
    wrapperSpan.appendChild(profileLink);
    songInfoElement.appendChild(wrapperSpan);

    if (!IsPIP) {
      madeTippys.add(
        createTooltip(profileLink, {
          ...Spicetify.TippyProps,
          ...(profileLink.ownerDocument === document
            ? {}
            : { appendTo: () => profileLink.ownerDocument.body }),
          content: "View Unison Profile",
        })
      );
    }
  }

  LyricsContainer.appendChild(songInfoElement);
  PinFooterDetailWithoutWriters(songInfoElement, LyricsContainer);
}

export function ApplyIsByCommunity(data: any, LyricsContainer: HTMLElement): void {
  if (!LyricsContainer) return;
  if (data?.source === "unison" && data.unisonCredit) {
    PageDocument = LyricsContainer.ownerDocument;
    CleanUpIsByCommunity();
    isByCommunityAbortController = new AbortController();
    ApplyUnisonCredits(data.unisonCredit, LyricsContainer, isByCommunityAbortController.signal);
    return;
  }
  if (
    data.source !== "spl"
    && (typeof data.sourceDisplayName !== "string"
      || data.sourceDisplayName.trim().toLowerCase() !== "spicy lyrics community")
  ) return;
  PageDocument = LyricsContainer.ownerDocument;

  // Clean up any previous listeners before adding new ones
  if (isByCommunityAbortController) {
    isByCommunityAbortController.abort();
  }

  if (madeTippys.size > 0) {
    madeTippys.forEach((tippy) => {
      if (tippy && typeof tippy.destroy === "function") {
        tippy.destroy();
      }
    });
    madeTippys.clear();
  }

  isByCommunityAbortController = new AbortController();
  const { signal } = isByCommunityAbortController;

  const songInfoElement = PageDocument.createElement("div");
  songInfoElement.classList.add("SongInfo", "CommunityCredits");
  LyricsContainer.classList.add("FromCommunity");

  const communityNote = PageDocument.createElement("span");
  communityNote.classList.add("SongInfoNote");
  communityNote.textContent = "These lyrics have been provided by our community";
  const communityLead = PageDocument.createElement("span");
  communityLead.classList.add("SongInfoLead");
  communityLead.textContent = "Community lyrics";
  songInfoElement.append(communityNote, communityLead);

  const preferredProfileName = (username?: string, displayName?: string) => {
    const cleanUsername = username?.trim();
    const cleanDisplayName = displayName?.trim();
    if (cleanUsername && cleanDisplayName && cleanUsername.toLowerCase() === cleanDisplayName.toLowerCase()) {
      return cleanDisplayName;
    }
    return $communityLyricsUseDisplayName.get()
      ? cleanDisplayName ?? cleanUsername
      : cleanUsername ?? cleanDisplayName;
  };

  const metadata = data.TTMLUploadMetadata;
  const nameOf = (person: any) =>
    preferredProfileName(
      person?.username,
      person?.displayName ?? person?.display_name ?? person?.globalName ?? person?.global_name,
    );

  type Credit = { id?: string; name?: string; avatar?: string };
  // Makers hidden in the lyrics text (HiddenMakers.ts) list everyone who made the sync, in order.
  // The one Maker the server keeps comes first when it isn't already among them.
  const hiddenMakerIds: string[] = Array.isArray(data.HiddenMakers) ? data.HiddenMakers : [];
  const makers: Credit[] = hiddenMakerIds.map((id) => ({ id }));
  if (metadata?.Maker?.id && !hiddenMakerIds.includes(metadata.Maker.id)) {
    makers.unshift({ id: metadata.Maker.id, name: nameOf(metadata.Maker), avatar: metadata.Maker.avatar });
  } else if (!metadata?.Maker?.id && nameOf(metadata?.Maker)) {
    makers.unshift({ name: nameOf(metadata?.Maker), avatar: metadata?.Maker?.avatar });
  }
  for (const maker of makers) {
    if (maker.id && maker.id === metadata?.Maker?.id) {
      maker.name ??= nameOf(metadata.Maker);
      maker.avatar ??= metadata.Maker.avatar;
    }
    // The uploader's own details stand in until the lookup answers.
    if (maker.id && maker.id === metadata?.Uploader?.id) {
      maker.name ??= nameOf(metadata.Uploader);
      maker.avatar ??= metadata.Uploader.avatar;
    }
  }
  const uploader: Credit | null = nameOf(metadata?.Uploader) || metadata?.Uploader?.id
    ? { id: metadata?.Uploader?.id, name: nameOf(metadata?.Uploader), avatar: metadata?.Uploader?.avatar }
    : null;

  const addTooltip = (element: HTMLElement) => {
    if (IsPIP) return;
    madeTippys.add(
      createTooltip(element, {
        ...Spicetify.TippyProps,
        ...(element.ownerDocument === document ? {} : { appendTo: () => element.ownerDocument.body }),
        content: `View TTML Profile`,
      })
    );
  };

  type Section = { credit: Credit; nameElement: HTMLSpanElement; avatarElement: HTMLImageElement };

  const createProfileSection = (type: "Maker" | "Uploader", labelText: string | null, credit: Credit): Section => {
    const wrapperSpan = PageDocument.createElement("span");
    wrapperSpan.classList.add(type);

    const profileSectionSpan = PageDocument.createElement("button");
    profileSectionSpan.type = "button";
    profileSectionSpan.classList.add("song-info-profile-section");

    if (labelText) {
      const labelSpan = PageDocument.createElement("span");
      labelSpan.classList.add("SongInfoRole");
      labelSpan.textContent = labelText;
      profileSectionSpan.append(labelSpan, " ");
    }

    // Always made, so an avatar that arrives later has a place to go.
    const img = PageDocument.createElement("img");
    img.alt = "";
    img.onerror = () => {
      img.style.display = "none";
    };
    if (credit.avatar) img.src = credit.avatar;
    else img.style.display = "none";
    profileSectionSpan.appendChild(img);

    const nameSpan = PageDocument.createElement("span");
    nameSpan.classList.add("SongInfoName");
    const usernameSpan = PageDocument.createElement("span");
    usernameSpan.textContent = credit.name ?? "…";
    if (!$communityLyricsUseDisplayName.get()) nameSpan.append("@");
    nameSpan.append(usernameSpan);
    profileSectionSpan.appendChild(nameSpan);

    // Spotify's playback shortcut must not cancel a keyboard button press.
    profileSectionSpan.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") event.stopPropagation();
    }, { signal });

    if (credit.id) {
      addTooltip(profileSectionSpan);
      profileSectionSpan.addEventListener("click", () => {
        openProfile(credit.id, profileSectionSpan, signal);
        if (IsPIP) globalThis.focus();
      }, { signal });
    }

    wrapperSpan.appendChild(profileSectionSpan);
    songInfoElement.appendChild(wrapperSpan);
    return { credit, nameElement: usernameSpan, avatarElement: img };
  };

  // "Made by A, B and C": the label once, then a separator before each further maker.
  // A further maker carries its own separator, and is marked so the "·" that sets credits apart
  // (RefinedCredits.css) isn't drawn before it as well.
  const sections: Section[] = makers.map((maker, index) => {
    const section = createProfileSection("Maker", index === 0 ? "Made by" : null, maker);
    if (index > 0) {
      const wrapper = section.nameElement.closest(".Maker")!;
      wrapper.classList.add("MakerContinued");
      const separator = PageDocument.createElement("span");
      separator.classList.add("SongInfoRole", "SongInfoSeparator");
      const last = index === makers.length - 1;
      separator.textContent = last ? "and" : ",";
      if (!last) separator.classList.add("Comma");
      wrapper.prepend(separator);
    }
    return section;
  });
  if (uploader) {
    sections.push(createProfileSection("Uploader", makers.length > 0 ? "Uploaded by" : "Made by", uploader));
  }
  LyricsContainer.appendChild(songInfoElement);
  PinFooterDetailWithoutWriters(songInfoElement, LyricsContainer);

  const communityCreditElements = [...new Set([
    ...GetLyricsFooterDetails(LyricsContainer),
    songInfoElement,
  ])];
  const creditStates = communityCreditElements.map((element) => ({
    element: element as HTMLElement,
    opacity: element.style.opacity,
  }));
  const restoreCreditOpacity = (element: HTMLElement, opacity: string) => {
    if (opacity) element.style.opacity = opacity;
    else element.style.removeProperty("opacity");
  };
  creditStates.forEach(({ element: creditElement }) => {
    // Commit the hidden starting state without transitioning away from visible.
    creditElement.style.transition = "none";
    creditElement.style.opacity = "0";
  });

  let creditsRevealed = false;
  const revealCredits = () => {
    if (creditsRevealed || signal.aborted) return;
    creditsRevealed = true;

    // Pinned details can belong to the popout before the writer footer is mounted.
    const creditDocument = songInfoElement.ownerDocument;
    if (creditDocument !== document) {
      creditStates.forEach(({ element, opacity }) => {
        restoreCreditOpacity(element, opacity);
      });
      return;
    }

    const creditWindow = creditDocument.defaultView ?? window;
    let revealFrame: number | null = null;
    signal.addEventListener("abort", () => {
      if (revealFrame !== null) creditWindow.cancelAnimationFrame(revealFrame);
    }, { once: true });
    revealFrame = creditWindow.requestAnimationFrame(() => {
      if (signal.aborted) return;
      revealFrame = creditWindow.requestAnimationFrame(() => {
        revealFrame = null;
        if (signal.aborted) return;
        creditStates.forEach(({ element, opacity }) => {
          element.style.transition = "opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)";
          restoreCreditOpacity(element, opacity);
        });
      });
    });
  };

  const lookups = sections.filter((section) => section.credit.id);
  // Resolve the owning document after the renderer mounts its detached tree.
  // Popouts show the supplied names while optional profile lookups finish.
  queueMicrotask(() => {
    if (songInfoElement.ownerDocument !== document || lookups.length === 0) {
      revealCredits();
    }
  });
  if (lookups.length === 0) return;

  // Names first: the credits show once every name is known. Avatars a section is missing load
  // through the profile (slower; Firecrawl on the worker the first time) and fill in after.
  const nameUpdates = lookups.map(({ credit, nameElement, avatarElement }) =>
    resolveProfileIdentity(credit.id!).then((profile) => {
      if (signal.aborted) return;
      if (profile) {
        const renderedName = credit.name?.trim();
        nameElement.textContent = preferredProfileName(
          profile.username,
          renderedName || profile.displayName,
        ) ?? profile.username;
      } else if (!credit.name) {
        nameElement.textContent = "Unknown";
      }
      if (!credit.avatar) {
        void resolveProfileAvatar(credit.id!).then((avatar) => {
          if (signal.aborted || !avatar) return;
          avatarElement.src = avatar;
          avatarElement.style.removeProperty("display");
        });
      }
    })
  );
  void Promise.allSettled(nameUpdates).then(revealCredits);
}
